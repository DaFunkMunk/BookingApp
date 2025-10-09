export interface IWebInfo {
  absoluteUrl: string;
  serverRelativeUrl: string;
}

export interface IUserInfo {
  email: string;
  displayName: string;
}

export interface IPageContext {
  web: IWebInfo;
  user: IUserInfo;
}

export interface WebPartContext {
  pageContext: IPageContext;
  spHttpClient: unknown;
}

