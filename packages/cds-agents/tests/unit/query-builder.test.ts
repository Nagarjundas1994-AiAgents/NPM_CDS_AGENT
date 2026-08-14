import { toODataFilter, toODataQueryParams } from '../../src/query-builder';

describe('toODataFilter', () => {
  it('passes through raw OData strings', () => {
    expect(toODataFilter("gpa lt 2.0")).toBe('gpa lt 2.0');
  });

  it('treats scalar values as eq', () => {
    expect(toODataFilter({ status: 'active' })).toBe("status eq 'active'");
  });

  it('formats numbers and booleans without quotes', () => {
    expect(toODataFilter({ gpa: { lt: 2.0 }, active: true })).toBe(
      'gpa lt 2 and active eq true'
    );
  });

  it('escapes single quotes in strings', () => {
    expect(toODataFilter({ name: "O'Brien" })).toBe("name eq 'O''Brien'");
  });

  it('uses OData functions for contains/startswith/endswith', () => {
    expect(toODataFilter({ firstName: { contains: 'Ali' } })).toBe(
      "contains(firstName,'Ali')"
    );
    expect(toODataFilter({ code: { startswith: 'CS' } })).toBe("startswith(code,'CS')");
  });

  it('joins multiple fields with and', () => {
    expect(toODataFilter({ status: { eq: 'active' }, gpa: { lt: 2 } })).toBe(
      "status eq 'active' and gpa lt 2"
    );
  });
});

describe('toODataQueryParams', () => {
  it('builds OData query options from a structured query', () => {
    expect(
      toODataQueryParams({
        filter: { gpa: { lt: 2 } },
        select: ['ID', 'firstName'],
        orderBy: ['gpa desc'],
        top: 10,
        skip: 5,
      })
    ).toEqual({
      $filter: 'gpa lt 2',
      $select: 'ID,firstName',
      $orderby: 'gpa desc',
      $top: 10,
      $skip: 5,
    });
  });

  it('omits empty filter objects', () => {
    expect(toODataQueryParams({ filter: {} })).toEqual({});
  });
});
