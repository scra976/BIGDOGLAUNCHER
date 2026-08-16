/// <reference types="vite/client" />

import type { BigDogApi } from "../shared/types";

declare global {
  interface Window {
    bigdog: BigDogApi;
  }
}

export {};
