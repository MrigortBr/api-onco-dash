import { In, type Repository } from 'typeorm';
import type { UserPermission } from '../database/entities/user-permission.entity.js';

/** Perfil vigente = linha mais recente de user_permission (histórico, igual ao SIMDASH). */
export function latestPermission(repo: Repository<UserPermission>, userId: number): Promise<UserPermission | null> {
  return repo.findOne({ where: { idUsers: userId }, order: { id: 'DESC' } });
}

/** Perfil vigente de vários usuários de uma vez (DISTINCT ON). Sem `userIds`, de todos. */
export async function latestPermissionsByUserId(
  repo: Repository<UserPermission>,
  userIds?: number[],
): Promise<Map<number, UserPermission>> {
  if (userIds && userIds.length === 0) return new Map();
  const qb = repo
    .createQueryBuilder('up')
    .distinctOn(['up.idUsers'])
    .orderBy('up.idUsers', 'ASC')
    .addOrderBy('up.id', 'DESC');
  if (userIds) qb.where({ idUsers: In(userIds) });
  const rows = await qb.getMany();
  return new Map(rows.map((row) => [row.idUsers, row]));
}
