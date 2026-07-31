import {
  createContext,
  useContext,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";
import type { Language } from "../config.js";

export type Route =
  | { screen: "dashboard" }
  | { screen: "contest"; contestId: string; endsAt: number | null };

export interface AppState {
  /** Navigation stack; the last entry is the visible screen. */
  routes: Route[];
  language: Language;
  /** True while a text input (e.g. the / filter) owns the keyboard. */
  inputActive: boolean;
}

export type AppAction =
  | { type: "push"; route: Route }
  | { type: "pop" }
  | { type: "toggleLanguage" }
  | { type: "setInputActive"; value: boolean };

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "push":
      return { ...state, routes: [...state.routes, action.route] };
    case "pop":
      return state.routes.length > 1
        ? { ...state, routes: state.routes.slice(0, -1) }
        : state;
    case "toggleLanguage":
      return { ...state, language: state.language === "en" ? "ja" : "en" };
    case "setInputActive":
      return { ...state, inputActive: action.value };
  }
}

const StateContext = createContext<AppState | null>(null);
const DispatchContext = createContext<Dispatch<AppAction> | null>(null);

export function StoreProvider({
  language,
  children,
}: {
  language: Language;
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, {
    routes: [{ screen: "dashboard" }],
    language,
    inputActive: false,
  });
  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>
        {children}
      </DispatchContext.Provider>
    </StateContext.Provider>
  );
}

export function useAppState(): AppState {
  const state = useContext(StateContext);
  if (state === null) throw new Error("useAppState outside StoreProvider");
  return state;
}

export function useAppDispatch(): Dispatch<AppAction> {
  const dispatch = useContext(DispatchContext);
  if (dispatch === null)
    throw new Error("useAppDispatch outside StoreProvider");
  return dispatch;
}

export function useCurrentRoute(): Route {
  const { routes } = useAppState();
  return routes[routes.length - 1]!;
}
