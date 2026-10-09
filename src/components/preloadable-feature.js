import { lazy } from "react";

export function preloadableFeature(loader) {
  let pending;
  const load = () => (pending ||= loader());
  const component = lazy(load);
  component.preload = load;
  return component;
}
