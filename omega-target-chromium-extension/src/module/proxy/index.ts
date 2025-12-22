/** @module omega-target-chromium-extension/proxy */

import ProxyImpl from './proxy_impl';
import ListenerProxyImpl from './proxy_impl_listener';
import ScriptProxyImpl from './proxy_impl_script';
import SettingsProxyImpl from './proxy_impl_settings';

export const proxyImpls = [ListenerProxyImpl, ScriptProxyImpl, SettingsProxyImpl];

export function getProxyImpl(log: any): ProxyImpl {
  for (const Impl of proxyImpls) {
    if (Impl.isSupported()) {
      return new Impl(log);
    }
  }
  throw new Error('Your browser does not support proxy settings!');
}
