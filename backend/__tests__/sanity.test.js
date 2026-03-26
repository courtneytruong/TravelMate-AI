describe("Jest sanity check", () => {
  test("Jest is working correctly", () => {
    expect(1 + 1).toBe(2);
  });

  test("ES modules environment is set up", () => {
    expect(typeof process.env).toBe("object");
  });
});
