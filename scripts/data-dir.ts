// Resolves the data folder for the build scripts.
//   --data <dir>   explicit folder (relative to the repo root or absolute)
//   default        ./data  (your working data, git-ignored)
// The committed sample data lives in ./fixtures (`npm run data:sample`).
import { existsSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

export const ROOT = join(import.meta.dirname, '..')

export function dataDir(): string {
    const argv = process.argv.slice(2)
    const i = argv.findIndex((a) => a === '--data' || a.startsWith('--data='))
    const value = i < 0 ? 'data' : argv[i].includes('=') ? argv[i].split('=')[1] : argv[i + 1]
    const dir = isAbsolute(value) ? value : join(ROOT, value)
    if (!existsSync(dir)) {
        console.error(
            `Data folder not found: ${dir}\n` +
                `Put your XML into ./data (xml/<collection>/*.xml, indices/*.xml) or run "npm run data:sample" for the sample data.`,
        )
        process.exit(1)
    }
    return dir
}
