import { 
  listL2Profiles, 
  getL2Profile, 
  L2NetworkProfile 
} from "@hardkas/l2";

/**
 * HardKAS L2 Module
 * @alpha
 */
export class HardkasL2 {
  /**
   * Lists all available L2 network profiles.
   */
  listProfiles(): readonly L2NetworkProfile[] {
    return listL2Profiles();
  }

  /**
   * Gets a specific L2 network profile by name.
   */
  getProfile(name: string): L2NetworkProfile | null {
    return getL2Profile(name) || null;
  }
}
