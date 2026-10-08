import { Text, type StyleProp, type TextStyle } from "react-native";

export type AppIconProps = {
  name?: string;
  children?: string;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
  selected?: boolean;
};

// Native keeps its existing glyphs; the web sibling supplies scalable outlines.
export function AppIcon({ name, children, size, color, style }: AppIconProps) {
  return (
    <Text
      accessible={false}
      style={[
        style,
        size ? { fontSize: size } : undefined,
        color ? { color } : undefined,
      ]}
    >
      {children ?? name}
    </Text>
  );
}
