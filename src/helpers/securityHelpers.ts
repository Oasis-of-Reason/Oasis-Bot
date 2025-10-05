import { 
    GuildMember, 
    RoleResolvable 
} from "discord.js";

/**
 * Checks if a user has at least one role from the allowed list.
 *
 * @param member The GuildMember to check
 * @param allowedRoles An array of role IDs or names that are allowed
 * @returns true if the user has one or more of the allowed roles, false otherwise
 */
export function userHasAllowedRole(member: GuildMember, allowedRoles: RoleResolvable[]): boolean {
  
    if (!member || !member.roles?.cache) return false;

    for (const role of allowedRoles) {
        // RoleResolvable can be ID or name — check both
        const hasRole =
        member.roles.cache.has(role.toString()) ||
        member.roles.cache.some(r => r.name === role.toString());

        if (hasRole) {
            return true;
        }
    }

    return false;
}

export function getStandardRolesAdmin(): RoleResolvable[] {
    return ["Admins"];
}

export function getStandardRolesMod(): RoleResolvable[] {
    return ["Admins", "Moderator"];
}

export function getStandardRolesOrganizer(): RoleResolvable[] {
    return ["Admins", "Moderator", "Event Organizer"];
}

export function getStandardRolesHost(): RoleResolvable[] {
    return ["Admins", "Moderator", "Event Organizer", "Event Host"];
}

export function getStandardRolesMember(): RoleResolvable[] {
    return ["Admins", "Moderator", "Event Organizer", "Event Host", "Members"];
}