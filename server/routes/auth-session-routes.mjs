import express from 'express';

export function createAuthSessionRouter({
  auth,
  pool,
  q,
  cookieValue,
  sha256,
  permissionsFor,
}) {
  const router = express.Router();

  router.get('/session', auth, async (req, res) => {
    const user = req.user;
    res.json({
      user: {
        id:user.id,
        username:user.username,
        name:user.name,
        email:user.email,
        phone:user.phone,
        role:user.role,
        companyIds:user.company_ids,
        permissions:permissionsFor(user),
        isActive:true,
      },
    });
  });

  router.post('/logout', auth, async (req, res, next) => {
    try {
      const token = cookieValue(req, 'masar_session');
      await pool.query(`DELETE FROM ${q('sessions')} WHERE token_hash=$1`, [sha256(token)]);
      res.setHeader('Set-Cookie', 'masar_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
