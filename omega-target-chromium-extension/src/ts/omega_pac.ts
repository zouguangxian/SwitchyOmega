export const OmegaPac = {
  Conditions: {
    requestFromUrl(url: string): any {
      return {
        url,
        host: new URL(url).hostname
      };
    },
    str(condition: any): string {
      return condition.toString();
    }
  }
}; 