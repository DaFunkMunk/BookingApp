declare module '@microsoft/sp-http' {
  export {
    SPHttpClient,
    SPHttpClientResponse,
    ISPHttpClientOptions,
  } from '../standalone-app/src/shims/sp-http';
}

declare module '@microsoft/sp-webpart-base' {
  export {
    WebPartContext,
    IPageContext,
    IWebInfo,
    IUserInfo,
  } from '../standalone-app/src/shims/sp-webpart-base';
}
