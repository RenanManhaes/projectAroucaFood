const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

admin.initializeApp();

const ADMIN_EMAILS = [
  'ti.emporioarouca@gmail.com',
  'renan@gmail.com',
];

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const isAdmin = (auth) => {
  const email = normalizeEmail(auth && auth.token ? auth.token.email : '');
  return !!auth && ADMIN_EMAILS.includes(email);
};

exports.manageUserByAdmin = onCall(async (request) => {
  if (!isAdmin(request.auth)) {
    throw new HttpsError('permission-denied', 'Apenas administradores podem gerenciar usuários.');
  }

  const data = request.data || {};
  const action = String(data.action || '').trim();
  const uid = String(data.uid || '').trim();

  if (!uid) {
    throw new HttpsError('invalid-argument', 'UID obrigatório.');
  }

  if (uid === request.auth.uid && action === 'delete') {
    throw new HttpsError('failed-precondition', 'Não é permitido excluir o próprio usuário admin.');
  }

  if (action === 'updateName') {
    const name = String(data.name || '').replace(/\s+/g, ' ').trim();
    if (!name) {
      throw new HttpsError('invalid-argument', 'Nome inválido para atualização.');
    }

    await admin.auth().updateUser(uid, { displayName: name });
    await admin.firestore().collection('users').doc(uid).set(
      {
        name,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return { ok: true, message: 'Usuário atualizado com sucesso.' };
  }

  if (action === 'delete') {
    await admin.auth().deleteUser(uid);
    await admin.firestore().collection('users').doc(uid).delete();
    await admin.firestore().collection('carts').doc(uid).delete().catch(() => null);

    return { ok: true, message: 'Usuário excluído com sucesso.' };
  }

  throw new HttpsError('invalid-argument', 'Ação inválida.');
});
