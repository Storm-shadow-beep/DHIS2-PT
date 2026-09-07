import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as userManagementService from '../services/user-management.service';

export const listUsers = asyncHandler(async (_req: Request, res: Response) => {
  const users = await userManagementService.listUsers();
  res.json({ users });
});

export const setUserActive = asyncHandler(async (req: Request, res: Response) => {
  const { isActive } = req.body as { isActive?: unknown };
  if (typeof isActive !== 'boolean') {
    res.status(400).json({ message: 'isActive must be a boolean' });
    return;
  }

  const user = await userManagementService.setUserActive(
    req.params.userId,
    isActive,
    req.user!.sub,
  );
  res.json({ message: 'User status updated', user });
});

export const assignRole = asyncHandler(async (req: Request, res: Response) => {
  const { roleName, role } = req.body as { roleName?: unknown; role?: unknown };
  const requestedRole = roleName ?? role;
  if (typeof requestedRole !== 'string') {
    res.status(400).json({ message: 'roleName is required' });
    return;
  }

  const user = await userManagementService.assignGlobalRole(
    req.params.userId,
    requestedRole,
    req.user!.sub,
  );
  res.json({ message: 'Role assigned', user });
});

export const removeRole = asyncHandler(async (req: Request, res: Response) => {
  const user = await userManagementService.removeGlobalRole(
    req.params.userId,
    req.params.roleName,
    req.user!.sub,
  );
  res.json({ message: 'Role removed', user });
});
