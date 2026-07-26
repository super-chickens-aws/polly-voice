export type StoredMedia = {
    key: string;
    contentType: string;
    size: number;
    downloadUrl: string;
};
export interface MediaStorage {
    save(key: string, body: Buffer, contentType: string): Promise<StoredMedia>;
    get(key: string): Promise<Buffer>;
    downloadUrl(key: string): Promise<string>;
    delete(key: string): Promise<void>;
}
export declare const mediaStorage: MediaStorage;
