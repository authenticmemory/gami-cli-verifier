// src/theme.ts

import { bold, cyan, dim, green, red, underline, yellow } from "picocolors";

export const theme = {
    heading: (s: string) => bold(cyan(s)),
    label: (s: string) => dim(s),
    value: (s: string) => bold(s),
    ok: (s: string) => green(s),
    warn: (s: string) => yellow(s),
    err: (s: string) => bold(red(s)),
    path: (s: string) => underline(cyan(s)),
};
