export const APP_DOMAIN = "e-rechnung.top4reinigung.de";

// Official Cloudflare IPv4 ranges: https://www.cloudflare.com/ips-v4
const CLOUDFLARE_RANGES = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
];

function ipv4(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p) || Number(p) > 255)) return null;
  return parts.reduce((value, part) => ((value << 8) | Number(part)) >>> 0, 0);
}

export function validHostingAddresses(domain: string, addresses: string[]): boolean {
  if (domain !== APP_DOMAIN || !addresses.length) return false;
  return addresses.every((address) => {
    const value = ipv4(address);
    if (value === null) return false;
    return CLOUDFLARE_RANGES.some((range) => {
      const [network, bits] = range.split("/");
      const mask = (0xffffffff << (32 - Number(bits))) >>> 0;
      return (value & mask) === (ipv4(network!)! & mask);
    });
  });
}

export function isCurrentHttpsConnection(domain: string, requestUrl: string): boolean {
  const url = new URL(requestUrl);
  return url.hostname === domain && url.protocol === "https:";
}
