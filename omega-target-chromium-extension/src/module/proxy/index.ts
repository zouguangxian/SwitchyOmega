/** @module omega-target-chromium-extension/proxy */

import ListenerProxyImpl from './proxy_impl_listener';
import SettingsProxyImpl from './proxy_impl_settings';
import ScriptProxyImpl from './proxy_impl_script';
import ProxyImpl from './proxy_impl';

export const proxyImpls = [ListenerProxyImpl, ScriptProxyImpl, SettingsProxyImpl];

export function getProxyImpl(log: any): ProxyImpl {
  for (const Impl of proxyImpls) {
    if (Impl.isSupported()) {
      return new Impl(log);
    }
  }
  throw new Error('Your browser does not support proxy settings!');
}
