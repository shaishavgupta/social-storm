export interface BrowserStateSnapshot {
  id: number;
  sessionId: number;
  profileId?: number;
  createdAt: Date;
  cookies: any[];
  localStorage: Record<string, Record<string, string>>; // origin -> key -> value
  storageDumpVersion: number;
}

export interface CreateBrowserStateSnapshotParams {
  sessionId: number;
  profileId?: number;
  cookies: any[];
  localStorage: Record<string, Record<string, string>>;
  storageDumpVersion?: number;
}

