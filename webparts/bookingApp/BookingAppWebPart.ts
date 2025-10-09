/**
 * SharePoint Web Part wrapper
 * ---------------------------
 *
 * The standalone Vite + Mongo build no longer relies on the SPFx runtime, but
 * we keep the original web part implementation here for reference. The full
 * source is commented out so the TypeScript compiler in this workspace does not
 * attempt to resolve SPFx packages.
 *
 * If you need to deploy back into SharePoint, restore the block below, reinstall
 * the `@microsoft/sp-*` packages, and build with the SPFx toolchain.
 */

export {};

/*
import * as React from 'react';
import * as ReactDom from 'react-dom';
import { Version } from '@microsoft/sp-core-library';
import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';

import BookingApp, { BookingAppProps } from './components/BookingApp';
import styles from './components/BookingApp.module.scss';

export interface IBookingAppWebPartProps {
  description: string;
}

export default class BookingAppWebPart extends BaseClientSideWebPart<IBookingAppWebPartProps> {
  public render(): void {
    const element: React.ReactElement<BookingAppProps> = React.createElement(BookingApp, {
      context: this.context,
      className: styles.container,
      // Use HTTPS API (set up local certs to avoid mixed content)
      apiBaseUrl: 'https://localhost:4001',
      onReset: () => {
        // eslint-disable-next-line no-console
        console.log('Reset clicked');
      },
    });

    ReactDom.render(element, this.domElement);
  }

  protected onDispose(): void {
    ReactDom.unmountComponentAtNode(this.domElement);
  }

  protected get dataVersion(): Version {
    return Version.parse('1.0');
  }
}
*/
