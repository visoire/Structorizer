// SPDX-License-Identifier: GPL-3.0-or-later
// Decision D-06: no crypto.randomUUID (missing in non-secure contexts such as http://<lan-ip>/).

let counter = 0;
const session = Math.floor(Math.random() * 36 ** 4).toString(36).padStart(4, '0');

export function newId(): string {
  counter += 1;
  return `e_${session}${counter.toString(36)}`;
}
