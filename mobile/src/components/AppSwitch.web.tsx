import { StyleSheet, type SwitchProps } from "react-native";
import type { CSSProperties } from "react";
import { useTheme } from "../theme";

type Props = Pick<
  SwitchProps,
  | "accessibilityLabel"
  | "disabled"
  | "onValueChange"
  | "value"
  | "style"
  | "thumbColor"
  | "trackColor"
>;

export function AppSwitch({
  accessibilityLabel,
  disabled,
  onValueChange,
  value,
  style,
  trackColor,
}: Props) {
  const { colors } = useTheme();
  const requestedTrack = value ? trackColor?.true : trackColor?.false;
  const trackBackground =
    typeof requestedTrack === "string"
      ? requestedTrack
      : value
        ? colors.success
        : colors.border;
  return (
    <label
      className="ios-switch"
      style={{
        ...(StyleSheet.flatten(style) as CSSProperties),
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <input
        type="checkbox"
        role="switch"
        className="ios-switch-input"
        aria-label={accessibilityLabel}
        disabled={!!disabled}
        checked={!!value}
        onChange={(event) => onValueChange?.(event.currentTarget.checked)}
      />
      <span
        aria-hidden="true"
        className="ios-switch-track"
        style={{ backgroundColor: trackBackground }}
      >
        <span
          className="ios-switch-thumb"
          style={{ transform: `translateX(${value ? 20 : 0}px)` }}
        />
      </span>
    </label>
  );
}
