/// <reference types="nativewind/types" />

declare module "*.css"

declare module "*.png" {
  const asset: number;
  export default asset;
}
