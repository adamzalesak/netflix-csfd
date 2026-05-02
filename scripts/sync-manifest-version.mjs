import { readFileSync, writeFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const manifestPath = "manifest.json";
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

if (manifest.version !== pkg.version) {
  manifest.version = pkg.version;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`manifest.json version → ${pkg.version}`);
}
