/* ============================================================
   Bring-your-own-key LLM client + real Python runtime (Pyodide).
   The key is stored only in this browser (localStorage, optional)
   and requests go directly from the visitor's browser to the
   provider — this site has no servers.
   ============================================================ */

window.LLM = (function () {
  "use strict";

  const PROVIDERS = {
    groq:       { name: "Groq · free keys, browser-friendly",  base: "https://api.groq.com/openai/v1",  model: "llama-3.3-70b-versatile" },
    openrouter: { name: "OpenRouter · many models",            base: "https://openrouter.ai/api/v1",    model: "meta-llama/llama-3.3-70b-instruct" },
    openai:     { name: "OpenAI",                               base: "https://api.openai.com/v1",       model: "gpt-4o-mini" },
    xai:        { name: "xAI",                                  base: "https://api.x.ai/v1",             model: "grok-3-mini" }
  };

  let cfg = { provider: "groq", model: "", key: "", remember: false };
  try {
    const saved = JSON.parse(localStorage.getItem("byok-cfg") || "null");
    if (saved && saved.key) cfg = saved;
  } catch (e) { /* ignore */ }

  function setConfig(c) {
    cfg = Object.assign({}, cfg, c);
    try {
      if (cfg.remember) localStorage.setItem("byok-cfg", JSON.stringify(cfg));
      else localStorage.removeItem("byok-cfg");
    } catch (e) { /* ignore */ }
  }

  const getConfig = () => Object.assign({}, cfg);
  const configured = () => !!cfg.key;
  const isMock = () => cfg.key === "mock";

  /* --- mock provider: scripted tool-calls so the FULL real pipeline
         (loop, virtual FS, genuine Pyodide execution) can be exercised
         without a key. Activated by entering "mock" as the key. --- */
  let mockTurn = 0;
  function mockChat() {
    const turns = [
      { content: "Plan: implement two_sum with a hash map (O(n)), write tests, run them.", tool_calls: [{ id: "m1", function: { name: "write_file", arguments: JSON.stringify({ path: "two_sum.py", content: "def two_sum(nums, target):\n    seen = {}\n    for i, x in enumerate(nums):\n        if target - x in seen:\n            return [seen[target - x], i]\n        seen[x] = i\n    return []\n" }) } }] },
      { content: "Now a test file covering normal, duplicate and no-solution cases.", tool_calls: [{ id: "m2", function: { name: "write_file", arguments: JSON.stringify({ path: "test_two_sum.py", content: "from two_sum import two_sum\nassert two_sum([2,7,11,15], 9) == [0,1]\nassert two_sum([3,3], 6) == [0,1]\nassert two_sum([1,2], 7) == []\nprint('all 3 tests passed')\n" }) } }] },
      { content: "Running the tests for real in Pyodide.", tool_calls: [{ id: "m3", function: { name: "run_python", arguments: JSON.stringify({ path: "test_two_sum.py" }) } }] },
      { content: "Tests pass. two_sum.py implements an O(n) hash-map solution; test_two_sum.py verifies three cases. Task complete." }
    ];
    const t = turns[Math.min(mockTurn++, turns.length - 1)];
    return Promise.resolve({ role: "assistant", content: t.content || "", tool_calls: t.tool_calls || undefined });
  }
  function mockReset() { mockTurn = 0; }

  async function chat(messages, tools) {
    if (isMock()) return mockChat();
    const p = PROVIDERS[cfg.provider] || PROVIDERS.groq;
    const model = cfg.model || p.model;
    let res;
    try {
      res = await fetch(p.base + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + cfg.key },
        body: JSON.stringify({ model, messages, tools, tool_choice: tools ? "auto" : undefined, temperature: 0.2 })
      });
    } catch (e) {
      throw new Error("Browser couldn't reach the provider (network/CORS). Groq and OpenRouter keys work best from browsers.");
    }
    if (res.status === 401 || res.status === 403) throw new Error("The provider rejected the key (401/403). Check the key and provider selection.");
    if (!res.ok) throw new Error("Provider error " + res.status + ": " + (await res.text()).slice(0, 200));
    const data = await res.json();
    const msg = data.choices && data.choices[0] && data.choices[0].message;
    if (!msg) throw new Error("Unexpected provider response shape.");
    return msg;
  }

  return { PROVIDERS, getConfig, setConfig, configured, isMock, mockReset, chat };
})();

/* ---------------- real Python via Pyodide ---------------- */
window.PY = (function () {
  "use strict";
  let pyodide = null, loading = null;

  function load() {
    if (pyodide) return Promise.resolve(pyodide);
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js";
      s.onload = async () => {
        try {
          pyodide = await window.loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/" });
          resolve(pyodide);
        } catch (e) { reject(e); }
      };
      s.onerror = () => reject(new Error("Failed to load Pyodide from CDN."));
      document.head.appendChild(s);
    });
    return loading;
  }

  async function run(files, entryPath, onStatus) {
    if (onStatus && !pyodide) onStatus("downloading Python runtime (Pyodide ~6 MB, once)…");
    const py = await load();
    for (const [path, content] of Object.entries(files)) {
      py.FS.writeFile(path, content);
      // auto-load scientific packages (numpy, pandas, …) referenced by the code
      try { await py.loadPackagesFromImports(content); } catch (e) { /* unknown imports surface at runtime */ }
    }
    const escaped = JSON.stringify(entryPath);
    const prog = `
import sys, io, traceback
_buf = io.StringIO()
_old_out, _old_err = sys.stdout, sys.stderr
sys.stdout = sys.stderr = _buf
_ok = True
try:
    with open(${escaped}) as _f:
        _src = _f.read()
    exec(compile(_src, ${escaped}, "exec"), {"__name__": "__main__"})
except Exception:
    _ok = False
    traceback.print_exc()
finally:
    sys.stdout, sys.stderr = _old_out, _old_err
(_ok, _buf.getvalue())
`;
    const result = await py.runPythonAsync(prog);
    const [ok, out] = result.toJs ? result.toJs() : result;
    if (result.destroy) result.destroy();
    return { ok: !!ok, out: String(out || "").slice(0, 1200) || "(no output)" };
  }

  return { run, loaded: () => !!pyodide };
})();
