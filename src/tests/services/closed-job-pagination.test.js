const mockSend = jest.fn();
jest.mock('../../aws_services/dynamoClient', () => ({ documentClient: { send: mockSend } }));
const { createEntityService } = require('../../services/entityServiceFactory');
beforeEach(() => mockSend.mockReset());
test('continues through an empty filtered page and preserves the final scan cursor', async () => {
  mockSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: { guid_id: 'closed-1' } })
    .mockResolvedValueOnce({ Items: [{ guid_id: 'open-1' }], LastEvaluatedKey: { guid_id: 'open-1' } })
    .mockResolvedValueOnce({ Items: [{ guid_id: 'open-2' }], LastEvaluatedKey: { guid_id: 'open-2' } });
  const result = await createEntityService('job', 'Vagas').list({ limit: 2, jobStatus: 'open' });
  expect(result).toEqual({ items: [{ guid_id: 'open-1' }, { guid_id: 'open-2' }], lastEvaluatedKey: { guid_id: 'open-2' } });
  const calls = mockSend.mock.calls.map(([command]) => command.input);
  expect(calls[0].FilterExpression).toContain('attribute_not_exists(#status) OR #status <> :closed');
  expect(calls[1].ExclusiveStartKey).toEqual({ guid_id: 'closed-1' });
  expect(calls[2].Limit).toBe(1);
});
test('closed filter resumes at the cursor and ends cleanly when no matching jobs remain', async () => {
  mockSend.mockResolvedValueOnce({ Items: [] });
  expect(await createEntityService('job', 'Vagas').list({ limit: 2, lastKey: { guid_id: 'cursor' }, jobStatus: 'closed' }))
    .toEqual({ items: [], lastEvaluatedKey: undefined });
  expect(mockSend.mock.calls[0][0].input).toMatchObject({ ExclusiveStartKey: { guid_id: 'cursor' },
    FilterExpression: '#entityType = :entityType AND #status = :closed',
    ExpressionAttributeValues: { ':closed': 'Encerrada' } });
});
test('does not hide scan failures', async () => {
  mockSend.mockRejectedValue(new Error('scan failed'));
  await expect(createEntityService('job', 'Vagas').list({ jobStatus: 'open' })).rejects.toThrow('scan failed');
});
