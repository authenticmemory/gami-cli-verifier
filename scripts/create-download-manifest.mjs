import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const [directory = 'release/downloads'] = process.argv.slice(2);
const version = JSON.parse(readFileSync('package.json')).version;
if (process.env.GITHUB_REF_NAME !== `v${version}`) throw new Error('Release tag must match package version');
const artifacts = [];
for (const platform of ['windows-x64', 'linux-x64', 'linux-arm64']) {
    const stem = `gami-verify-${version}-${platform}`;
    const archive = `${stem}${platform.startsWith('windows') ? '.zip' : '.tar.gz'}`;
    const checksum = `${stem}.sha256`;
    const names = [archive, checksum, `${stem}.cdx.json`];
    const signature = platform.startsWith('linux') ? `${archive}.asc` : null;
    if (signature) names.push(signature, `${checksum}.asc`, `${stem}.cdx.json.asc`);
    const files = names.map(name => ({ name, sha256: createHash('sha256').update(readFileSync(join(directory, name))).digest('hex') }));
    const expected = `${files[0].sha256}  ${archive}`;
    if (!readFileSync(join(directory, checksum), 'utf8').split(/\r?\n/).includes(expected)) throw new Error(`Archive checksum mismatch: ${archive}`);
    artifacts.push({ platform, archive, checksum, signature, files });
}
writeFileSync(join(directory, 'gami-verify-downloads.json'), JSON.stringify({ schema: 1, version, tag: `v${version}`, artifacts }, null, 2));
