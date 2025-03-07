declare module './profiles' {
  interface Profile {
    name: string;
    profileType: string;
    [key: string]: any;
  }

  interface ProfileOptions {
    [key: string]: any;
  }

  interface ReferenceSet {
    [key: string]: string;
  }

  interface ProfileNotFoundCallback {
    (name: string): Profile;
  }

  interface ReferenceSetOptions {
    profileNotFound?: ProfileNotFoundCallback;
  }

  function byName(name: string, options: ProfileOptions): Profile;
  function allReferenceSet(profile: Profile | string, options: ProfileOptions, args?: ReferenceSetOptions): ReferenceSet;
  function profileResult(name: string): any;
  function compile(profile: Profile): any;
  function profileNotFound(name: string, callback?: ProfileNotFoundCallback): Profile;
} 