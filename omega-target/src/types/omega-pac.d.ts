declare module 'omega-pac' {
  export interface Profile {
    name: string;
    profileType: string;
    [key: string]: any;
  }

  export interface Profiles {
    updateUrl(profile: Profile): boolean;
  }

  export const Profiles: Profiles;
} 