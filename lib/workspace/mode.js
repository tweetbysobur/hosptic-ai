// Demo availability. Set HOSPTIC_DEMO_ENABLED=false on the server to remove the /demo route
// once the hackathon is over. Read at request time, so no rebuild is needed.
export function demoEnabled() {
  return process.env.HOSPTIC_DEMO_ENABLED !== "false";
}
