import * as chai from 'chai';
import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';
import OptionsSync from '../src/options_sync';
import Storage from '../src/storage';
import Log from '../src/log';

chai.use(sinonChai);
const should = chai.should();

describe('OptionsSync', () => {
  before(() => {
    // Silence storage and sync logging.
    sinon.stub(Log, 'log');
  });

  after(() => {
    (Log.log as any).restore();
  });

  function hookPostBasic<T extends (...args: any[]) => any>(
    func: T,
    hook: T
  ): T {
    return function(this: any, ...args: Parameters<T>) {
      const result = func.apply(this, args);
      hook.apply(this, args);
      return result;
    } as T;
  }

  function hookPost(obj: any, method: string, hook: (...args: any[]) => void): void;
  function hookPost(func: any, hook: any): any;
  function hookPost(...args: any[]): any {
    if (args.length === 2) {
      const [func, hook] = args;
      return hookPostBasic(func, hook);
    } else {
      const [obj, method, hook] = args;
      obj[method] = hookPostBasic(obj[method], hook);
    }
  }

  describe('#merge', () => {
    const sync = new OptionsSync();
    
    it('should choose the one with newer revision', () => {
      const newVal = { revision: '2' };
      const oldVal = { revision: '1' };
      sync.merge('example', newVal, oldVal).should.equal(newVal);
    });
    
    it('should use oldVal when sync is disabled in newVal', () => {
      const newVal = { revision: '2', is: 'newVal', syncOptions: 'disabled' };
      const oldVal = { revision: '1', is: 'oldVal' };
      sync.merge('example', newVal, oldVal).should.equal(oldVal);
    });
    
    it('should use oldVal when sync is disabled in oldVal', () => {
      const newVal = { revision: '2', is: 'newVal' };
      const oldVal = { revision: '1', is: 'oldVal', syncOptions: 'disabled' };
      sync.merge('example', newVal, oldVal).should.equal(oldVal);
    });
    
    it('should favor oldVal when revisions are equal', () => {
      const newVal = { revision: '1', is: 'newVal' };
      const oldVal = { revision: '1', is: 'oldVal' };
      sync.merge('example', newVal, oldVal).should.equal(oldVal);
    });
    
    it('should favor oldVal when newVal deeply equals oldVal', () => {
      const newVal = { they: 'are', the: 'same' };
      const oldVal = { they: 'are', the: 'same' };
      sync.merge('example', newVal, oldVal).should.equal(oldVal);
    });
    
    it('should choose newVal when newVal is different', () => {
      const newVal = { they: 'are', not: 'equal' };
      const oldVal = { they: 'are', not: 'identical' };
      sync.merge('example', newVal, oldVal).should.equal(newVal);
    });
  });

  describe('#requestPush', () => {
    const unlimited = new (OptionsSync as any).TokenBucket();

    it('should store pendingChanges', () => {
      const sync = new OptionsSync();
      sync.enabled = false;
      sync.requestPush({ a: 1 });
      sync.pendingChanges().should.eql({ a: 1 });
    });
    
    it('should schedule storage write', (done) => {
      const check = () => {
        if ((storage.set as any).callCount === 0 || (storage.remove as any).callCount === 0) return;
        (storage.set as any).should.have.been.calledOnce.and.calledWith({ b: 1 });
        (storage.remove as any).should.have.been.calledOnce.and.calledWith(['a']);
        done();
      };

      const storage = new Storage();
      storage.set({ a: 1 });
      hookPost(storage, 'set', check);
      hookPost(storage, 'remove', check);

      sinon.spy(storage, 'set');
      sinon.spy(storage, 'remove');

      const sync = new OptionsSync(storage, unlimited);
      (sync as any).debounce = 0;
      sync.requestPush({ a: undefined, b: 1 });
    });

    it('should combine multiple write operations', (done) => {
      const check = () => {
        if ((storage.set as any).callCount === 0 || (storage.remove as any).callCount === 0) return;
        (storage.set as any).should.have.been.calledOnce.and.calledWith({ c: 1, d: 1 });
        (storage.remove as any).should.have.been.calledOnce.and.calledWith(['a', 'b']);
        done();
      };

      const storage = new Storage();
      storage.set({ a: 1, b: 1 });
      hookPost(storage, 'set', check);
      hookPost(storage, 'remove', check);

      sinon.spy(storage, 'set');
      sinon.spy(storage, 'remove');

      const sync = new OptionsSync(storage, unlimited);
      (sync as any).debounce = 0;
      sync.requestPush({ a: undefined });
      sync.requestPush({ b: 2 });
      sync.requestPush({ b: undefined });
      sync.requestPush({ c: 1 });
      sync.requestPush({ d: 1 });
      sync.requestPush({ e: 1 });
      sync.requestPush({ e: undefined });
    });

    it('should disable syncing for the profiles if quota is exceeded', (done) => {
      const options: any = {
        '+a': { is: 'a', oversized: true },
        'b': { is: 'b' }
      };

      const storage = new Storage();
      (storage as any).set = (changes: any) => {
        for (const key in changes) {
          const value = changes[key];
          if (value.oversized) {
            const err: any = new Storage.QuotaExceededError();
            err.perItem = true;
            return Promise.reject(err);
          }
        }
        (storage.set as any).should.have.been.calledTwice;
        (storage.set as any).should.have.been.calledWith(options);
        (storage.set as any).should.have.been.calledWith({ b: { is: 'b' } });
        options['+a'].syncOptions.should.equal('disabled');
        options['+a'].syncError.reason.should.equal('quotaPerItem');
        done();
        return Promise.resolve();
      };

      sinon.spy(storage, 'set');

      const sync = new OptionsSync(storage, unlimited);
      (sync as any).debounce = 0;
      sync.requestPush(options);
    });
  });

  describe('#copyTo', () => {
    it('should fetch all items from remote storage', (done) => {
      const remote = new Storage();
      remote.set({ a: 1, b: 2, c: 3 });

      const storage = new Storage();
      hookPost(storage, 'set', () => {
        (storage.set as any).should.have.been.calledOnce.and.calledWith({ a: 1, b: 2, c: 3 });
        done();
      });

      sinon.spy(storage, 'set');

      const sync = new OptionsSync(remote);
      sync.copyTo(storage);
    });

    it('should merge with local as base', (done) => {
      const check = () => {
        if ((storage.set as any).callCount === 0 || (storage.remove as any).callCount === 0) return;
        (storage.set as any).should.have.been.calledOnce.and.calledWith({ b: 2, c: 3 });
        (storage.remove as any).should.have.been.calledOnce.and.calledWith(['d']);
        done();
      };

      const remote = new Storage();
      remote.set({ a: 1, b: 2, c: 3, d: undefined });

      const storage = new Storage();
      storage.set({ a: 1, b: 0, d: 4 });

      hookPost(storage, 'set', check);
      hookPost(storage, 'remove', check);

      sinon.spy(storage, 'set');
      sinon.spy(storage, 'remove');

      const sync = new OptionsSync(remote);
      sync.copyTo(storage);
    });
  });

  describe('#watchAndPull', () => {
    it('should pull changes into local when remote changes', (done) => {
      const check = () => {
        if ((storage.set as any).callCount === 0 || (storage.remove as any).callCount === 0) return;
        (remote.watch as any).should.have.been.calledOnce;
        (storage.set as any).should.have.been.calledOnce.and.calledWith({ b: 2, c: 3 });
        (storage.remove as any).should.have.been.calledOnce.and.calledWith(['d']);
        done();
      };

      const remote = new Storage();
      hookPost(remote, 'watch', (_: any, callback: any) => {
        setTimeout(() => {
          callback({ a: 1 });
          callback({ b: 2 });
          callback({ c: 3 });
          callback({ d: undefined });
        }, 10);
      });

      sinon.spy(remote, 'watch');

      const storage = new Storage();
      storage.set({ a: 1, b: 0, d: 4 });

      hookPost(storage, 'set', check);
      hookPost(storage, 'remove', check);

      sinon.spy(storage, 'set');
      sinon.spy(storage, 'remove');

      const sync = new OptionsSync(remote);
      (sync as any).pullThrottle = 0;
      sync.watchAndPull(storage);
    });
  });
});

