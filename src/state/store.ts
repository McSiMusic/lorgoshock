"use client";

import { configureStore, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { GameState } from "../game/model";

const gameSlice = createSlice({
  name: "game",
  initialState: { state: null as GameState | null, error: null as string | null },
  reducers: {
    syncState: (store, action: PayloadAction<GameState>) => {
      store.state = action.payload;
      store.error = null;
    },
    resetState: (store) => {
      store.state = null;
      store.error = null;
    },
    setError: (store, action: PayloadAction<string | null>) => {
      store.error = action.payload;
    },
  },
});

export const { resetState, syncState, setError } = gameSlice.actions;

export const makeStore = () => configureStore({ reducer: { game: gameSlice.reducer } });
export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
