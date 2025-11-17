# Contributing to TelyX

Thank you for your interest in contributing to TelyX! We welcome contributions from the community.

## =Ë Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Process](#development-process)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Commit Messages](#commit-messages)

## > Code of Conduct

### Our Pledge

We pledge to make participation in our project a harassment-free experience for everyone, regardless of age, body size, disability, ethnicity, gender identity and expression, level of experience, nationality, personal appearance, race, religion, or sexual identity and orientation.

### Our Standards

- Using welcoming and inclusive language
- Being respectful of differing viewpoints and experiences
- Gracefully accepting constructive criticism
- Focusing on what is best for the community
- Showing empathy towards other community members

## =€ Getting Started

### 1. Fork the Repository

Click the "Fork" button in the top right of the repository page.

### 2. Clone Your Fork

```bash
git clone https://github.com/YOUR_USERNAME/TelyX.git
cd TelyX
```

### 3. Add Upstream Remote

```bash
git remote add upstream https://github.com/sulthonzh/TelyX.git
```

### 4. Set Up Development Environment

**Backend:**
```bash
cd backend
go mod download
```

**Frontend:**
```bash
cd frontend
npm install
```

### 5. Create a Branch

```bash
git checkout -b feature/your-feature-name
```

## =» Development Process

### Backend Development

1. **Run tests before making changes**
   ```bash
   cd backend
   go test ./...
   ```

2. **Make your changes**
   - Follow Go best practices
   - Add tests for new functionality
   - Update documentation as needed

3. **Run tests again**
   ```bash
   go test ./...
   ```

4. **Check code formatting**
   ```bash
   go fmt ./...
   gofmt -s -w .
   ```

5. **Run linter (optional but recommended)**
   ```bash
   golangci-lint run
   ```

### Frontend Development

1. **Run tests before making changes**
   ```bash
   cd frontend
   npm test
   ```

2. **Make your changes**
   - Follow React best practices
   - Add tests for new components
   - Update documentation as needed

3. **Run tests again**
   ```bash
   npm test
   ```

4. **Check linting**
   ```bash
   npm run lint
   ```

5. **Build to ensure no errors**
   ```bash
   npm run build
   ```

## =Ý Pull Request Process

### Before Submitting

1. **Update your fork**
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Run all tests**
   ```bash
   # Backend
   cd backend && go test ./...

   # Frontend
   cd frontend && npm test
   ```

3. **Ensure your code is properly formatted**

### Submitting the PR

1. **Push your branch**
   ```bash
   git push origin feature/your-feature-name
   ```

2. **Create Pull Request**
   - Go to the original repository
   - Click "New Pull Request"
   - Select your fork and branch
   - Fill out the PR template

3. **PR Title Format**
   ```
   [Component] Brief description

   Examples:
   [Backend] Add distributed tracing support
   [Frontend] Implement error boundary
   [Docs] Update API documentation
   [Tests] Add integration tests for handlers
   ```

4. **PR Description Should Include**
   - What changes were made
   - Why these changes were necessary
   - How to test the changes
   - Screenshots (if applicable)
   - Related issues (if any)

### Review Process

- Maintainers will review your PR
- Address any feedback or requested changes
- Once approved, your PR will be merged

## =Ð Coding Standards

### Go (Backend)

1. **Follow Go conventions**
   - Use `gofmt` for formatting
   - Follow [Effective Go](https://golang.org/doc/effective_go.html)
   - Use meaningful variable and function names

2. **Package structure**
   - Keep packages focused and cohesive
   - Use interfaces for abstraction
   - Avoid circular dependencies

3. **Error handling**
   ```go
   // Good
   if err != nil {
       return fmt.Errorf("failed to process request: %w", err)
   }

   // Avoid
   if err != nil {
       panic(err)
   }
   ```

4. **Comments**
   - Document all exported functions
   - Use godoc format
   ```go
   // ProcessLog processes incoming log data and stores it in OpenSearch.
   // It returns an error if the log cannot be processed or stored.
   func ProcessLog(data []byte) error {
       // ...
   }
   ```

### TypeScript/React (Frontend)

1. **Follow TypeScript best practices**
   - Use strict mode
   - Define interfaces for props and state
   - Avoid `any` type

2. **Component structure**
   ```typescript
   // Good
   interface Props {
       title: string;
       onClose: () => void;
   }

   const MyComponent: React.FC<Props> = ({ title, onClose }) => {
       // ...
   };

   export default MyComponent;
   ```

3. **Hooks**
   - Use hooks for state management
   - Extract complex logic into custom hooks
   - Follow Rules of Hooks

4. **Comments**
   ```typescript
   /**
    * Sends telemetry data to the backend.
    * @param data - The telemetry data to send
    * @returns Promise that resolves when data is sent
    */
   async function sendTelemetry(data: LogData): Promise<void> {
       // ...
   }
   ```

## >ê Testing Guidelines

### Backend Tests

1. **Unit tests**
   - Test each function independently
   - Use table-driven tests for multiple cases
   ```go
   func TestValidate(t *testing.T) {
       tests := []struct {
           name    string
           input   Config
           wantErr bool
       }{
           {"valid config", validConfig, false},
           {"invalid port", invalidPortConfig, true},
       }

       for _, tt := range tests {
           t.Run(tt.name, func(t *testing.T) {
               err := tt.input.Validate()
               if (err != nil) != tt.wantErr {
                   t.Errorf("Validate() error = %v, wantErr %v", err, tt.wantErr)
               }
           })
       }
   }
   ```

2. **Integration tests**
   - Test handler functions with HTTP requests
   - Mock external dependencies

3. **Test coverage**
   - Aim for >80% coverage
   - Run: `go test -cover ./...`

### Frontend Tests

1. **Component tests**
   ```typescript
   test('renders health status', async () => {
       render(<HealthCheck />);
       await waitFor(() => {
           expect(screen.getByText(/healthy/i)).toBeInTheDocument();
       });
   });
   ```

2. **Service tests**
   - Test telemetry service
   - Mock fetch calls

3. **Test coverage**
   - Aim for >80% coverage
   - Run: `npm test -- --coverage`

## =Ý Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, missing semicolons, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### Examples

```
feat(backend): add distributed tracing support

- Implement OpenTelemetry tracing
- Add trace context propagation
- Update middleware to create spans

Closes #123
```

```
fix(frontend): resolve memory leak in HealthCheck component

The useEffect hook was not cleaning up the interval,
causing a memory leak when the component unmounted.

Fixes #456
```

## <¯ Types of Contributions

We welcome various types of contributions:

### = Bug Reports

- Use the issue template
- Include steps to reproduce
- Provide expected vs actual behavior
- Include relevant logs or screenshots

### ( Feature Requests

- Describe the feature clearly
- Explain the use case
- Discuss potential implementation

### =Ö Documentation

- Fix typos or improve clarity
- Add examples
- Translate documentation

### >ê Tests

- Increase test coverage
- Add integration tests
- Improve test quality

### <¨ UI/UX Improvements

- Improve user interface
- Enhance user experience
- Add accessibility features

## <÷ Issue Labels

- `bug`: Something isn't working
- `enhancement`: New feature or request
- `documentation`: Documentation improvements
- `good first issue`: Good for newcomers
- `help wanted`: Extra attention needed
- `question`: Further information requested

## =¬ Questions?

Feel free to:
- Open an issue with the `question` label
- Contact the maintainers
- Join our community discussions

## =Ü License

By contributing to TelyX, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to TelyX! <‰
