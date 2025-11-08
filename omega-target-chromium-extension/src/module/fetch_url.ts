/** @module omega-target-chromium-extension/fetch_url */

import * as OmegaTarget from 'omega-target';

const xhrLib = require('xhr');

const { ContentTypeRejectedError } = OmegaTarget;

interface XhrResponse {
  statusCode?: number;
  headers: Record<string, string>;
}

interface HintHandlerContext {
  contentType: string;
  hint: string;
}

type HintHandler = (response: any, body: string, context: HintHandlerContext) => string | undefined;

// Native Promise wrapper for xhr
const xhr = (...args: any[]): Promise<[any, string]> => {
  return new Promise((resolve, reject) => {
    xhrLib(...args, (err: any, response: any, body: string) => {
      if (err) {
        reject(err);
      } else {
        resolve([response, body]);
      }
    });
  });
};

const xhrWrapper = (...args: any[]): Promise<[any, string]> => {
  return xhr(...args).catch((err: any) => {
    if (!err.isOperational) throw err;
    
    if (!err.statusCode) {
      throw new OmegaTarget.NetworkError(err);
    }
    if (err.statusCode === 404) {
      throw new OmegaTarget.HttpNotFoundError(err);
    }
    if (err.statusCode >= 500 && err.statusCode < 600) {
      throw new OmegaTarget.HttpServerError(err);
    }
    throw new OmegaTarget.HttpError(err);
  });
};

const fetchUrl = (
  dest_url: string,
  opt_bypass_cache?: boolean,
  opt_type_hints?: string[]
): Promise<string> => {
  const getResBody = ([response, body]: [XhrResponse, string]): string => {
    if (!opt_type_hints) return body;
    
    const contentType = response.headers['content-type']?.toLowerCase();
    for (const hint of opt_type_hints) {
      const handler = hintHandlers[hint] || defaultHintHandler;
      const result = handler(response, body, { contentType, hint });
      if (result != null) return result;
    }
    throw new ContentTypeRejectedError('Unrecognized Content-Type: ' + contentType);
  };

  if (opt_bypass_cache && dest_url.indexOf('?') < 0) {
    // Use native URL API for cache busting
    const parsed = new URL(dest_url);
    parsed.searchParams.set('_', Date.now().toString());
    const dest_url_nocache = parsed.toString();
    // Try first with the cache-busting parameter.
    return xhrWrapper(dest_url_nocache)
      .then(getResBody)
      .catch(() => {
        // If failed, try again with the original URL.
        return xhrWrapper(dest_url).then(getResBody);
      });
  } else {
    return xhrWrapper(dest_url).then(getResBody);
  }
};

const defaultHintHandler: HintHandler = (response, body, { contentType, hint }) => {
  if ('!' + contentType === hint) {
    throw new ContentTypeRejectedError('Response Content-Type blacklisted: ' + contentType);
  }
  if (contentType === hint) {
    return body;
  }
  return undefined;
};

const hintHandlers: Record<string, HintHandler> = {
  '*': (response, body) => {
    // Allow all contents.
    return body;
  },

  '!text/html': (response, body, { contentType, hint }) => {
    if (contentType === hint) {
      // Sometimes other content can also be served with the text/html
      // Content-Type header. So we check if the body actually looks like HTML.
      let looksLikeHtml = false;
      if (body.indexOf('<!DOCTYPE') >= 0 || body.indexOf('<!doctype') >= 0) {
        looksLikeHtml = true;
      } else if (body.indexOf('</html>') >= 0) {
        looksLikeHtml = true;
      } else if (body.indexOf('</body>') >= 0) {
        looksLikeHtml = true;
      }

      if (looksLikeHtml) {
        throw new ContentTypeRejectedError('Response must not be HTML.');
      }
    }
    return undefined;
  },

  '!application/xhtml+xml': (...args) => hintHandlers['!text/html'](...args),

  'application/x-ns-proxy-autoconfig': (response, body, { contentType, hint }) => {
    if (contentType === hint) {
      return body;
    }
    // Sometimes PAC scripts can also be served using with wrong Content-Type.
    if (body.indexOf('FindProxyForURL') >= 0) {
      return body;
    } else {
      // The content is not a PAC script if it does not contain FindProxyForURL.
      return undefined;
    }
  }
};

export default fetchUrl;

