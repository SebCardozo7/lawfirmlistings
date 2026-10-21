"""Give Python a list of certificate authorities, because on this machine it has none.

`ssl.get_default_verify_paths().cafile` is None here. Python does not read the Windows
certificate store, and nothing else had put a bundle where OpenSSL looks, so every HTTPS
request from every crawler in this pipeline failed the same way:

    <urlopen error [SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed:
     unable to get local issuer certificate>

It does not fail loudly. `fetch()` in crawl_public returns (None, "", reason) for a transport
error, which is the same shape as a host that does not exist, so the pipeline recorded those
firms as sites it could not reach and moved on. 170 injury firms were marked unreadable in the
sub-practice run on that basis. Every one of them answers 200 to curl, with the same user agent,
from the same machine, in the same second. The sites were never the problem.

Two things are set here and either would do on its own. SSL_CERT_FILE is what OpenSSL itself
consults, so it reaches code that builds its own context, and the patched factory reaches code
that builds none. Both point at certifi, which is Mozilla's bundle and is what requests, pip and
most of the ecosystem already trust.

Import it for the side effect, before the first request:

    import _tls  # noqa: F401

scripts/check_tls.mjs refuses a script that opens a URL without it, because an import whose
only purpose is a side effect is exactly the import somebody tidies away.
"""
import os
import ssl

try:
    import certifi
except ImportError:  # pragma: no cover
    certifi = None


def _bundle() -> str | None:
    """certifi's bundle, or whatever OpenSSL already had if certifi is not installed."""
    if certifi is not None:
        path = certifi.where()
        if os.path.exists(path):
            return path
    return ssl.get_default_verify_paths().cafile


CA_BUNDLE = _bundle()

if CA_BUNDLE:
    # For anything that reads the environment rather than taking a context: OpenSSL does, and so
    # do several libraries that wrap it.
    os.environ.setdefault("SSL_CERT_FILE", CA_BUNDLE)
    os.environ.setdefault("REQUESTS_CA_BUNDLE", CA_BUNDLE)

    def _context(*args, **kwargs):
        """The default context urllib builds when a caller passes none, with the bundle in it."""
        kwargs.setdefault("cafile", CA_BUNDLE)
        return ssl.create_default_context(*args, **kwargs)

    # urllib.request.urlopen calls this when no context is given. Patching it is what makes the
    # fix reach eighteen scripts without eighteen call sites changing.
    ssl._create_default_https_context = _context  # type: ignore[attr-defined]
