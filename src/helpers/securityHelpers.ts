import {
	GuildMember,
	RoleResolvable
} from "discord.js";

/**
 * Checks if a member's ID is in the list of allowed member IDs.
 *
 * @param member The GuildMember to check
 * @param allowedRoles An array of role IDs or names that are allowed
 * @param allowedMemberIds An array of allowed Discord user IDs
 * @returns true if the member's ID is in the allowed list, or they have an allowed role, false otherwise
 */
export function userHasAllowedRoleOrId(member: GuildMember, allowedRoles: RoleResolvable[], allowedMemberIds: string[] = []): boolean {
	return userHasAllowedRole(member, allowedRoles) || userHasAllowedId(member, allowedMemberIds);
}

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

/**
 * Checks if a member's ID is in the list of allowed member IDs.
 *
 * @param member The GuildMember to check
 * @param allowedMemberIds An array of allowed Discord user IDs
 * @returns true if the member's ID is in the allowed list, false otherwise
 */
export function userHasAllowedId(member: GuildMember, allowedMemberIds: string[]): boolean {
	if (!member || !member.id) return false;
	return allowedMemberIds.includes(member.id);
}

export function getStandardRolesAdmin(): RoleResolvable[] {
	return ["Admin"];
}

export function getStandardRolesMod(): RoleResolvable[] {
	return ["Admin", "Moderator"];
}

export function getStandardRolesOrganizer(): RoleResolvable[] {
	return ["Admin", "Moderator", "Event Organiser"];
}

export function getStandardRolesHost(): RoleResolvable[] {
	return ["Admin", "Moderator", "Event Organiser", "Event Host"];
}

export function getStandardRolesMember(): RoleResolvable[] {
	return ["Admin", "Moderator", "Event Organiser", "Event Host", "Members"];
}