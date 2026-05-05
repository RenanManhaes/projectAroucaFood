import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';

type ManageUserAction = 'updateName' | 'delete';

type ManageUserPayload = {
  action: ManageUserAction;
  uid: string;
  name?: string;
};

type ManageUserResult = {
  ok: boolean;
  message: string;
};

const callable = httpsCallable<ManageUserPayload, ManageUserResult>(functions, 'manageUserByAdmin');

export const updateUserByAdmin = async (uid: string, name: string) => {
  const normalizedName = name.replace(/\s+/g, ' ').trim();
  if (!uid || !normalizedName) {
    throw new Error('Dados inválidos para atualizar usuário.');
  }

  const result = await callable({
    action: 'updateName',
    uid,
    name: normalizedName,
  });

  if (!result.data?.ok) {
    throw new Error(result.data?.message || 'Falha ao atualizar usuário.');
  }
};

export const deleteUserByAdmin = async (uid: string) => {
  if (!uid) {
    throw new Error('UID inválido para exclusão.');
  }

  const result = await callable({
    action: 'delete',
    uid,
  });

  if (!result.data?.ok) {
    throw new Error(result.data?.message || 'Falha ao excluir usuário.');
  }
};
