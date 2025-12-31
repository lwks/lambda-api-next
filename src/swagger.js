const swaggerJsdoc = require('swagger-jsdoc');

const swaggerDefinition = {
  openapi: '3.0.1',
  info: {
    title: 'Lambda API Next',
    version: '1.0.0',
    description:
      'Documentação da API para gerenciar candidatos, empresas, usuários e vagas.',
  },
  servers: [
    {
      url: '/',
      description: 'Servidor local',
    },
  ],
  tags: [
    { name: 'Health' },
    { name: 'Candidates' },
    { name: 'Companies' },
    { name: 'Users' },
    { name: 'Jobs' },
  ],
  components: {
    schemas: {
      Candidate: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'candidate-123' },
          guid_id: { type: 'string', example: 'GUID-001' },
          name: { type: 'string', example: 'John Doe' },
          email: { type: 'string', format: 'email', example: 'john@example.com' },
        },
        required: ['guid_id'],
      },
      Company: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'company-123' },
          cd_cnpj: { type: 'string', example: '12.345.678/0001-90' },
          name: { type: 'string', example: 'ACME Corp' },
          email: { type: 'string', format: 'email', example: 'contato@acme.com' },
        },
        required: ['cd_cnpj'],
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'user-123' },
          cd_cpf: { type: 'string', example: '123.456.789-00' },
          name: { type: 'string', example: 'Ana Silva' },
          email: { type: 'string', format: 'email', example: 'ana@example.com' },
        },
        required: ['cd_cpf'],
      },
      Job: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'job-123' },
          guid_id: { type: 'string', example: 'GUID-002' },
          title: { type: 'string', example: 'Desenvolvedor Backend' },
          description: {
            type: 'string',
            example: 'Posição para desenvolvedor Node.js com experiência em AWS.',
          },
        },
        required: ['guid_id'],
      },
      PaginatedResponse: {
        type: 'object',
        properties: {
          items: { type: 'array', items: { type: 'object' } },
          lastKey: { type: 'string', nullable: true },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string', example: 'Mensagem de erro' },
          details: { type: 'object', nullable: true },
        },
      },
    },
    responses: {
      NotFound: {
        description: 'Recurso não encontrado',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      ValidationError: {
        description: 'Dados inválidos na requisição',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      NoContent: {
        description: 'Operação concluída sem conteúdo',
      },
    },
  },
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Verifica o status da API',
        responses: {
          200: {
            description: 'API funcionando',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/candidates': {
      get: {
        tags: ['Candidates'],
        summary: 'Lista candidatos com paginação opcional',
        parameters: [
          {
            in: 'query',
            name: 'limit',
            schema: { type: 'integer', minimum: 1, maximum: 100 },
            description: 'Número máximo de itens retornados (padrão 20)',
          },
          {
            in: 'query',
            name: 'lastKey',
            schema: { type: 'string' },
            description: 'Cursor de paginação retornado em chamadas anteriores',
          },
        ],
        responses: {
          200: {
            description: 'Lista de candidatos',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/PaginatedResponse' },
                    {
                      properties: {
                        items: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/Candidate' },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Candidates'],
        summary: 'Cria um novo candidato',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Candidate' },
            },
          },
        },
        responses: {
          201: {
            description: 'Candidato criado',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Candidate' },
              },
            },
          },
          400: { $ref: '#/components/responses/ValidationError' },
        },
      },
    },
    '/api/candidates/{id}': {
      get: {
        tags: ['Candidates'],
        summary: 'Busca candidato pelo ID',
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: {
            description: 'Candidato encontrado',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Candidate' },
              },
            },
          },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
      put: {
        tags: ['Candidates'],
        summary: 'Atualiza dados de um candidato',
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Candidate' },
            },
          },
        },
        responses: {
          200: {
            description: 'Candidato atualizado',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Candidate' },
              },
            },
          },
          400: { $ref: '#/components/responses/ValidationError' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
      delete: {
        tags: ['Candidates'],
        summary: 'Remove um candidato',
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          204: { $ref: '#/components/responses/NoContent' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/companies': {
      get: {
        tags: ['Companies'],
        summary: 'Lista empresas com paginação opcional',
        parameters: [
          {
            in: 'query',
            name: 'limit',
            schema: { type: 'integer', minimum: 1, maximum: 100 },
            description: 'Número máximo de itens retornados (padrão 20)',
          },
          {
            in: 'query',
            name: 'lastKey',
            schema: { type: 'string' },
            description: 'Cursor de paginação retornado em chamadas anteriores',
          },
        ],
        responses: {
          200: {
            description: 'Lista de empresas',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/PaginatedResponse' },
                    {
                      properties: {
                        items: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/Company' },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Companies'],
        summary: 'Cria uma nova empresa',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Company' },
            },
          },
        },
        responses: {
          201: {
            description: 'Empresa criada',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Company' },
              },
            },
          },
          400: { $ref: '#/components/responses/ValidationError' },
        },
      },
    },
    '/api/companies/{id}': {
      get: {
        tags: ['Companies'],
        summary: 'Busca empresa pelo ID',
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: {
            description: 'Empresa encontrada',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Company' },
              },
            },
          },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
      put: {
        tags: ['Companies'],
        summary: 'Atualiza dados de uma empresa',
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Company' },
            },
          },
        },
        responses: {
          200: {
            description: 'Empresa atualizada',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Company' },
              },
            },
          },
          400: { $ref: '#/components/responses/ValidationError' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
      delete: {
        tags: ['Companies'],
        summary: 'Remove uma empresa',
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          204: { $ref: '#/components/responses/NoContent' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/users': {
      get: {
        tags: ['Users'],
        summary: 'Lista usuários com paginação opcional',
        parameters: [
          {
            in: 'query',
            name: 'limit',
            schema: { type: 'integer', minimum: 1, maximum: 100 },
            description: 'Número máximo de itens retornados (padrão 20)',
          },
          {
            in: 'query',
            name: 'lastKey',
            schema: { type: 'string' },
            description: 'Cursor de paginação retornado em chamadas anteriores',
          },
        ],
        responses: {
          200: {
            description: 'Lista de usuários',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/PaginatedResponse' },
                    {
                      properties: {
                        items: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/User' },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Users'],
        summary: 'Cria um novo usuário',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/User' },
            },
          },
        },
        responses: {
          201: {
            description: 'Usuário criado',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/User' },
              },
            },
          },
          400: { $ref: '#/components/responses/ValidationError' },
        },
      },
    },
    '/api/users/{id}': {
      get: {
        tags: ['Users'],
        summary: 'Busca usuário pelo ID',
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: {
            description: 'Usuário encontrado',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/User' },
              },
            },
          },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
      put: {
        tags: ['Users'],
        summary: 'Atualiza dados de um usuário',
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/User' },
            },
          },
        },
        responses: {
          200: {
            description: 'Usuário atualizado',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/User' },
              },
            },
          },
          400: { $ref: '#/components/responses/ValidationError' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
      delete: {
        tags: ['Users'],
        summary: 'Remove um usuário',
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          204: { $ref: '#/components/responses/NoContent' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/jobs': {
      get: {
        tags: ['Jobs'],
        summary: 'Lista vagas com paginação opcional',
        parameters: [
          {
            in: 'query',
            name: 'limit',
            schema: { type: 'integer', minimum: 1, maximum: 100 },
            description: 'Número máximo de itens retornados (padrão 20)',
          },
          {
            in: 'query',
            name: 'lastKey',
            schema: { type: 'string' },
            description: 'Cursor de paginação retornado em chamadas anteriores',
          },
        ],
        responses: {
          200: {
            description: 'Lista de vagas',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/PaginatedResponse' },
                    {
                      properties: {
                        items: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/Job' },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Jobs'],
        summary: 'Cria uma nova vaga',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Job' },
            },
          },
        },
        responses: {
          201: {
            description: 'Vaga criada',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Job' },
              },
            },
          },
          400: { $ref: '#/components/responses/ValidationError' },
        },
      },
    },
    '/api/jobs/{id}': {
      get: {
        tags: ['Jobs'],
        summary: 'Busca vaga pelo ID',
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: {
            description: 'Vaga encontrada',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Job' },
              },
            },
          },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
      put: {
        tags: ['Jobs'],
        summary: 'Atualiza dados de uma vaga',
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Job' },
            },
          },
        },
        responses: {
          200: {
            description: 'Vaga atualizada',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Job' },
              },
            },
          },
          400: { $ref: '#/components/responses/ValidationError' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
      delete: {
        tags: ['Jobs'],
        summary: 'Remove uma vaga',
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          204: { $ref: '#/components/responses/NoContent' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },
  },
};

const swaggerSpec = swaggerJsdoc({ definition: swaggerDefinition, apis: [] });

module.exports = { swaggerSpec };
