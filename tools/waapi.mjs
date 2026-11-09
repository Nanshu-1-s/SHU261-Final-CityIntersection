// 极简 WAAPI 客户端（WAMP over WebSocket），零依赖
// WAMP 约定：
//   CALL   = [48, id, {}, procedure, Arguments, ArgumentsKw]
//   RESULT = [50, id, details, Arguments, ArgumentsKw]
//   ERROR  = [8, 48, id, details, errorUri, Arguments, ArgumentsKw]
// WAAPI 的参数走 ArgumentsKw，结果也在 ArgumentsKw。

const CALL = 48, RESULT = 50, ERROR = 8;

export class WaapiClient {
  #ws;#pending = new Map();#next = 1;#ready;

  constructor(url = 'ws://127.0.0.1:8080/waapi') {
    this.#ws = new WebSocket(url);
    this.#ready = new Promise((res, rej) => {
      this.#ws.onopen = () => res();
      this.#ws.onerror = (e) => rej(new Error('WAAPI 连接失败: ' + (e.message || 'unknown')));
    });
    this.#ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(String(ev.data)); } catch { return; }
      if (!Array.isArray(msg)) return;
      if (msg[0] === RESULT) {
        const p = this.#pending.get(msg[1]);
        if (p) { this.#pending.delete(msg[1]); p.resolve(msg[4] ?? msg[3] ?? {}); }
      } else if (msg[0] === ERROR) {
        const id = msg[2];
        const p = this.#pending.get(id);
        if (p) {
          this.#pending.delete(id);
          const uri = msg[4] ?? 'error';
          const kw = msg[6] ?? msg[5] ?? {};
          const text = kw?.message ?? JSON.stringify(kw);
          const schema = kw?.details?.schemaExpect ? `\n  schemaExpect: ${String(kw.details.schemaExpect).slice(0, 500)}` : '';
          p.reject(new Error(`${uri}: ${text}${schema}`));
        }
      }
    };
  }

  async call(uri, args = {}, options = {}) {
    await this.#ready;
    const id = this.#next++;
    this.#ws.send(JSON.stringify([CALL, id, options, uri, [], args]));
    return await new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.#pending.has(id)) { this.#pending.delete(id); reject(new Error('WAAPI 超时: ' + uri)); }
      }, 180000);
    });
  }

  close() { try { this.#ws.close(); } catch {} }
}
