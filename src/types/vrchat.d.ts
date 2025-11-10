declare module "vrchat" {
  export class Configuration {
    constructor(config: Record<string, any>);
    username?: string;
    password?: string;
    cookie?: string;
  }

  export class AuthenticationApi {
    constructor(config?: Configuration);
    getCurrentUser(): Promise<any>;
    verify2FAEmailCode(params: { code: string }): Promise<any>;
  }

  // Common other APIs you might need later
  export class UsersApi {
    constructor(config?: Configuration);
    getUser(id: string): Promise<any>;
  }

  export class WorldsApi {
    constructor(config?: Configuration);
    getWorld(id: string): Promise<any>;
  }

  // Default export (commonjs style)
  const VRChat: {
    Configuration: typeof Configuration;
    AuthenticationApi: typeof AuthenticationApi;
    UsersApi: typeof UsersApi;
    WorldsApi: typeof WorldsApi;
  };

  export default VRChat;
}
