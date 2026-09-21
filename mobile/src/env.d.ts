declare const process: {
  env: {
    EXPO_PUBLIC_API_URL?: string;
  };
};

declare module '*.jpg' {
  const asset: number;
  export default asset;
}
