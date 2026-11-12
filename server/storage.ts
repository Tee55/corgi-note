import type { Entry } from "../shared/model.js";
export class Conflict extends Error {}
export interface Store {
  list(owner: string): Promise<Entry[]>;
  save(owner: string, entry: Entry, expected: number): Promise<void>;
  remove(owner: string, id: string, expected: number): Promise<void>;
  putPhoto(
    owner: string,
    name: string,
    bytes: Uint8Array,
    type: string,
  ): Promise<string>;
  photoExists(owner: string, key: string): Promise<boolean>;
  photoUrl(owner: string, key: string): Promise<string>;
  readPhoto?(
    owner: string,
    name: string,
  ): Promise<{ bytes: Uint8Array; type: string } | null>;
}
