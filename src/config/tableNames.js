const TABLE_NAMES = {
  candidate: process.env.CANDIDATE_TABLE_NAME || 'Candidaturas',
  candidateProfile: process.env.CANDIDATE_PROFILE_TABLE_NAME || 'candidato_perfil',
  company: process.env.COMPANY_TABLE_NAME || 'Empresas',
  user: process.env.USER_TABLE_NAME || 'Usuarios',
  job: process.env.JOB_TABLE_NAME || 'Vagas',
};

module.exports = { TABLE_NAMES };
