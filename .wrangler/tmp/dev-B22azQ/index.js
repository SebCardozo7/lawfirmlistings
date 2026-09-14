var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker/index.ts
import { EmailMessage } from "cloudflare:email";
var FIELDS = {
  firm: 120,
  website: 200,
  city: 80,
  practice: 80,
  contact: 120,
  role: 80,
  email: 160,
  phone: 40,
  request: 80,
  attorneys: 200,
  notes: 4e3,
  understood: 20
};
var LABELS = {
  firm: "Firm",
  website: "Website",
  city: "City and state",
  practice: "Primary practice area",
  contact: "Contact",
  role: "Role",
  email: "Email",
  phone: "Phone",
  request: "What they are asking for",
  attorneys: "Page naming their attorneys",
  notes: "Anything else",
  understood: "Confirmed the score is not for sale"
};
var json = /* @__PURE__ */ __name((status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8" }
}), "json");
function mime(from, to, subject, body) {
  const header = /* @__PURE__ */ __name((v) => v.replace(/[\r\n]+/g, " ").trim(), "header");
  const lines = [
    `From: Law Firm Listings <${header(from)}>`,
    `To: <${header(to)}>`,
    `Subject: ${header(subject)}`,
    `Message-ID: <${crypto.randomUUID()}@lawfirmlistings.com>`,
    `Date: ${(/* @__PURE__ */ new Date()).toUTCString()}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    body.replace(/\r?\n/g, "\r\n")
  ];
  return lines.join("\r\n");
}
__name(mime, "mime");
async function submit(request, env) {
  if (!env.SUBMISSIONS_TO || !env.SUBMISSIONS_FROM) {
    return json(503, { error: "This form is not connected to an inbox yet." });
  }
  let form;
  try {
    form = await request.formData();
  } catch {
    return json(400, { error: "That submission could not be read." });
  }
  if (String(form.get("company") ?? "").trim()) return json(200, { ok: true });
  const values = {};
  for (const [name, limit] of Object.entries(FIELDS)) {
    const raw = String(form.get(name) ?? "").trim();
    if (raw) values[name] = raw.slice(0, limit);
  }
  const missing = ["firm", "contact", "email"].filter((k) => !values[k]);
  if (missing.length) {
    return json(400, { error: `Missing: ${missing.join(", ")}.` });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email)) {
    return json(400, { error: "That email address does not look right." });
  }
  const body = [
    `${values.firm} has asked to be listed.`,
    "",
    ...Object.keys(FIELDS).filter((k) => values[k]).map((k) => `${LABELS[k]}: ${values[k]}`),
    "",
    `Sent from ${new URL(request.url).origin}/list-your-firm/`,
    `Received ${(/* @__PURE__ */ new Date()).toISOString()}`,
    request.headers.get("cf-connecting-ip") ? `From IP ${request.headers.get("cf-connecting-ip")}` : ""
  ].filter(Boolean).join("\n");
  try {
    await env.EMAIL.send(new EmailMessage(
      env.SUBMISSIONS_FROM,
      env.SUBMISSIONS_TO,
      mime(
        env.SUBMISSIONS_FROM,
        env.SUBMISSIONS_TO,
        `List your firm: ${values.firm}`,
        body
      )
    ));
  } catch (err) {
    console.error("send failed", err);
    return json(502, { error: "We could not deliver that. Please email us directly." });
  }
  return json(200, { ok: true });
}
__name(submit, "submit");
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/list-your-firm") {
      if (request.method !== "POST") {
        return json(405, { error: "POST only." });
      }
      return submit(request, env);
    }
    return env.ASSETS.fetch(request);
  }
};

// ../../AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-ZQ2vBX/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// ../../AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-ZQ2vBX/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
