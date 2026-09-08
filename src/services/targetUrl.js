/** Basic sanity check for a /scan target — must be a valid http(s) URL. */
export function isValidTargetUrl(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    return false;
  }
  return url.protocol === "http:" || url.protocol === "https:";
}
