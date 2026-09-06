// server/src/types/index.ts

export interface User {
  id: string;
  phone?: string;
  phone_hash?: string;
  email?: string;
  username?: string;
  display_name: string;
  avatar_url?: string;
  bio?: string;
  identity_public_key?: string;
  signed_prekey_id?: number;
  signed_prekey_public?: string;
  signed_prekey_sig?: string;
  registration_id?: number;
  is_online: boolean;
  last_seen?: Date;
  status_text?: string;
  mood?: string;
  ghost_mode: boolean;
  settings: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface AuthPayload {
  userId: string;
  username?: string;
}

export interface KeyBundle {
  identityKey: string;
  registrationId: number;
  signedPreKey: {
    keyId: number;
    publicKey: string;
    signature: string;
  };
  oneTimePreKeys: Array<{
    keyId: number;
    publicKey: string;
  }>;
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}