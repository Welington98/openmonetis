#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];
if (!version) {
	console.error("Uso: update-version-badge.mjs <versão>");
	process.exit(1);
}

const path = "README.md";
const readme = readFileSync(path, "utf8");
const updated = readme.replace(
	/(\[!\[Version\]\(https:\/\/img\.shields\.io\/badge\/version-)[^-]+(-blue)/,
	`$1${version}$2`,
);

if (updated === readme) {
	console.error("Badge de versão não encontrado no README.md.");
	process.exit(1);
}

writeFileSync(path, updated);
console.log(`README.md badge atualizado para ${version}`);
