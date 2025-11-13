const TABLE_NAMES = {
  candidate: process.env.CANDIDATE_TABLE_NAME || 'Empresas',
  company: process.env.COMPANY_TABLE_NAME || 'Candidaturas',
  user: process.env.USER_TABLE_NAME || 'Usuarios',
  job: process.env.JOB_TABLE_NAME || 'Vagas',
};

module.exports = { TABLE_NAMES };
