/* ES3-safe JSON codec for Windows Script Host JScript.
 * WSH does not guarantee a global JSON object. No eval or ActiveX script engine.
 */
function jsonParse(source: string): any {
  var index: number = 0;
  function spaces(): void {
    while (index < source.length && /\s/.test(source.charAt(index))) index++;
  }
  function fail(): never { throw new Error("Invalid JSON at character " + index); }
  function str(): string {
    if (source.charAt(index) !== '"') fail();
    index++;
    var out: string = "";
    while (index < source.length) {
      var c: string = source.charAt(index++);
      if (c === '"') return out;
      if (c === "\\") {
        if (index >= source.length) fail();
        c = source.charAt(index++);
        if (c === "u") {
          var digits: string = source.substr(index, 4);
          if (!/^[0-9a-fA-F]{4}$/.test(digits)) fail();
          out += String.fromCharCode(parseInt(digits, 16));
          index += 4;
        } else {
          var escapes: any = { '"':'"', "\\":"\\", "/":"/", b:"\b",
            f:"\f", n:"\n", r:"\r", t:"\t" };
          if (!Object.prototype.hasOwnProperty.call(escapes, c)) fail();
          out += escapes[c];
        }
      } else {
        if (c.charCodeAt(0) < 32) fail();
        out += c;
      }
    }
    return fail();
  }
  function value(): any {
    spaces();
    var c: string = source.charAt(index);
    if (c === '"') return str();
    if (c === "{") {
      index++; spaces();
      var obj: any = {};
      if (source.charAt(index) === "}") { index++; return obj; }
      while (true) {
        spaces();
        var key: string = str();
        if (key === "__proto__" || key === "constructor" || key === "prototype") fail();
        spaces();
        if (source.charAt(index++) !== ":") fail();
        obj[key] = value();
        spaces();
        if (source.charAt(index) === "}") { index++; return obj; }
        if (source.charAt(index++) !== ",") fail();
      }
    }
    if (c === "[") {
      index++; spaces();
      var arr: any[] = [];
      if (source.charAt(index) === "]") { index++; return arr; }
      while (true) {
        arr.push(value());
        spaces();
        if (source.charAt(index) === "]") { index++; return arr; }
        if (source.charAt(index++) !== ",") fail();
      }
    }
    var literal: string;
    if (source.substr(index, 4) === "true") { index += 4; return true; }
    if (source.substr(index, 5) === "false") { index += 5; return false; }
    if (source.substr(index, 4) === "null") { index += 4; return null; }
    var match: RegExpExecArray | null =
      /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(source.substr(index));
    if (!match) fail();
    index += match[0].length;
    var number: number = Number(match[0]);
    if (!isFinite(number)) fail();
    return number;
  }
  var result: any = value();
  spaces();
  if (index !== source.length) fail();
  return result;
}
function jsonStringify(input: any): string {
  function quote(s: string): string {
    return '"' + s.replace(/[\u0000-\u001f\\"]/g, function(c: string): string {
      var replacements: any = { '"':'\\"', "\\":"\\\\", "\b":"\\b",
        "\f":"\\f", "\n":"\\n", "\r":"\\r", "\t":"\\t" };
      if (Object.prototype.hasOwnProperty.call(replacements, c)) return replacements[c];
      var hex: string = c.charCodeAt(0).toString(16);
      return "\\u" + ("0000" + hex).slice(-4);
    }) + '"';
  }
  function encode(v: any, depth: number): string {
    if (depth > 30) throw new Error("JSON nesting too deep");
    if (v === null) return "null";
    if (typeof v === "string") return quote(v);
    if (typeof v === "boolean") return v ? "true" : "false";
    if (typeof v === "number") return isFinite(v) ? String(v) : "null";
    if (Object.prototype.toString.call(v) === "[object Array]") {
      var elements: string[] = [];
      for (var j: number = 0; j < v.length; j++) elements.push(encode(v[j], depth + 1));
      return "[" + elements.join(",") + "]";
    }
    if (typeof v === "object") {
      var keys: string[] = [];
      var key: string;
      for (key in v) {
        if (Object.prototype.hasOwnProperty.call(v, key) && v[key] !== undefined) {
          keys.push(quote(key) + ":" + encode(v[key], depth + 1));
        }
      }
      return "{" + keys.join(",") + "}";
    }
    throw new Error("Unsupported JSON value");
  }
  return encode(input, 0);
}
