import type { Timestamp } from "firebase/firestore";

export type Product = {
  id: string;
  name: string;
  price: number;
  category?: string | null;
  highlights?: boolean;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
};
