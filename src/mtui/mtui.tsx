import React from "react";
import { render } from "ink";
import { App } from "./App.js";
import type { TuiOptions } from "../tui/tui-types.js";

export async function runMtui(opts: TuiOptions) {
  const { waitUntilExit } = render(<App options={opts} />);
  await waitUntilExit();
}
